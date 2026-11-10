import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports, browser = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", "window", "document", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports, browser.window, browser.document);
  return loaded.exports;
}

const order = load("src\\lib\\providerOrder.ts", {});
const game = { id: "provider:one", title: "Game One", provider: "Provider", imageUrl: "https://cdn.example/one.jpg", isEnabled: true };

function cachedCatalog(getCatalog, settings = []) {
  let now = 0;
  const previous = Date.now;
  Date.now = () => now;
  const catalog = load("src\\lib\\gregmornCatalog.ts", {
    "@/models": { Game: { find: () => ({ lean: async () => settings }) } },
    "./gregmorn": { getGregmornCatalog: getCatalog },
    "./gregmornIdentity": { gregmornGameSlug: id => `slug-${id}` },
    "./providerArtwork": { providerArtwork: (_, fallback) => fallback },
    "./providerOrder": order,
  });
  return {
    ...catalog,
    advance: milliseconds => { now += milliseconds; },
    restore: () => { Date.now = previous; },
  };
}

test("warm catalog cache avoids provider latency but re-reads admin settings and separates currencies", async () => {
  const calls = [];
  const settings = [];
  const catalog = cachedCatalog(async currency => {
    calls.push(currency);
    await new Promise(resolve => setTimeout(resolve, 150));
    return [{ ...game, id: `${game.id}-${currency}` }];
  }, settings);
  try {
    await catalog.getProviderCatalog("PKR");
    settings.push({ slug: `slug-${game.id}-PKR`, isActive: false, isHot: true });
    const start = performance.now();
    const warm = await catalog.getProviderCatalog("PKR");
    assert.ok(performance.now() - start < 100, "warm cache must not wait for the 150ms provider");
    assert.equal(warm[0].isActive, false);
    assert.equal(warm[0].isHot, false);
    assert.deepEqual(calls, ["PKR"]);
    settings[0].isActive = true;
    assert.equal((await catalog.getProviderCatalog("PKR"))[0].isHot, true);
    settings[0].isHot = false;
    assert.equal((await catalog.getProviderCatalog("PKR"))[0].isHot, false);
    assert.equal((await catalog.getProviderCatalog("USD"))[0].id, `${game.id}-USD`);
    assert.deepEqual(calls, ["PKR", "USD"]);
  } finally { catalog.restore(); }
});

test("merged catalogue prefers enabled PKR and falls back to USD without duplicate cards or settings", async () => {
  const calls = [];
  const catalog = cachedCatalog(async currency => {
    calls.push(currency);
    return currency === "PKR" ? [
      { ...game, id: "both" }, { ...game, id: "pkr-only" },
      { ...game, id: "usd-enabled", isEnabled: false },
      { ...game, id: "both-off", isEnabled: false },
    ] : [
      { ...game, id: "both" }, { ...game, id: "usd-only" },
      { ...game, id: "usd-enabled" }, { ...game, id: "both-off", isEnabled: false },
    ];
  }, [{ slug: "slug-usd-only", isActive: false, isHot: true }]);
  try {
    const merged = await catalog.getProviderCatalog();
    assert.deepEqual(calls, ["PKR", "USD"]);
    assert.equal(merged.length, 5);
    const byId = new Map(merged.map(game => [game.id, game]));
    assert.equal(byId.get("both").currency, "PKR");
    assert.equal(byId.get("pkr-only").currency, "PKR");
    assert.equal(byId.get("usd-enabled").currency, "USD");
    assert.equal(byId.get("usd-enabled").isActive, true);
    assert.equal(byId.get("usd-only").currency, "USD");
    assert.equal(byId.get("usd-only").isActive, false, "fallback cannot bypass admin OFF");
    assert.equal(byId.get("usd-only").isHot, false);
    assert.equal(byId.get("both-off").currency, "PKR");
    assert.equal(byId.get("both-off").isActive, false);
    const usd = await catalog.getProviderCatalog("USD");
    assert.equal(usd.length, 4);
    assert.ok(usd.every(game => game.currency === "USD"));
    assert.deepEqual(calls, ["PKR", "USD"], "explicit and merged catalogues share currency caches");
  } finally { catalog.restore(); }
});

test("catalog retains unavailable provider entries separately from admin-hidden entries", async () => {
  const catalog = cachedCatalog(async () => [
    game, { ...game, id: "unavailable", isEnabled: false },
    { ...game, id: "hidden-unavailable", isEnabled: false },
  ], [{ slug: "slug-hidden-unavailable", isActive: false }]);
  try {
    const games = await catalog.getProviderCatalog();
    assert.equal(games.length, 3);
    assert.equal(games.find(game => game.id === "unavailable").isActive, false);
    assert.equal(games.find(game => game.id === "unavailable").isHiddenByAdmin, false);
    assert.equal(games.find(game => game.id === "hidden-unavailable").isHiddenByAdmin, true);
  } finally { catalog.restore(); }
});

test("simultaneous cold requests share one upstream call and failed loads are retried", async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const catalog = cachedCatalog(async () => {
    calls++;
    await gate;
    if (calls === 1) throw new Error("Provider unavailable");
    return [game];
  });
  try {
    const requests = [catalog.getProviderCatalog("PKR"), catalog.getProviderCatalog("PKR")];
    const results = Promise.allSettled(requests);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    release();
    assert.ok((await results).every(result => result.status === "rejected" && /Provider unavailable/.test(result.reason.message)));
    assert.equal((await catalog.getProviderCatalog("PKR")).length, 1);
    assert.equal(calls, 2, "errors are not cached");
  } finally { catalog.restore(); }
});

test("expired catalog returns immediately while refreshing in the background", async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const catalog = cachedCatalog(async () => {
    calls++;
    if (calls > 1) await gate;
    return [{ ...game, title: calls === 1 ? "Original" : "Updated" }];
  });
  try {
    await catalog.getProviderCatalog("PKR");
    catalog.advance(60_001);
    const stale = await catalog.getProviderCatalog("PKR");
    assert.equal(stale[0].title, "Original");
    assert.equal(calls, 2);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await catalog.getProviderCatalog("PKR"))[0].title, "Updated");
  } finally { release(); catalog.restore(); }
});

test("catalogs over 2MB retain every game and cache without Next data-cache size restrictions", async () => {
  let calls = 0;
  const games = Array.from({ length: 12000 }, (_, i) => ({ ...game, id: `game-${i}`, imageUrl: `https://cdn.example/${"x".repeat(300)}-${i}.jpg` }));
  assert.ok(Buffer.byteLength(JSON.stringify(games)) > 4_701_383);
  const catalog = cachedCatalog(async () => { calls++; return games; });
  try {
    assert.equal((await catalog.getProviderCatalog("PKR")).length, games.length);
    assert.equal((await catalog.getProviderCatalog("PKR")).length, games.length);
    assert.equal(calls, 1);
  } finally { catalog.restore(); }
});

test("future API games join the cached catalogue without registration or an allowlist", async () => {
  let games = [game];
  const settings = [{ slug: `slug-${game.id}`, isActive: false }];
  const catalog = cachedCatalog(async () => games, settings);
  try {
    await catalog.getProviderCatalog();
    const added = { ...game, id: "future-provider:new-game", title: "Future Sports Game", provider: "New Provider", category: "sports" };
    games = [game, added];
    catalog.advance(60_001);
    await catalog.getProviderCatalog();
    await new Promise(resolve => setImmediate(resolve));
    const updated = await catalog.getProviderCatalog();
    assert.equal(updated.length, 2);
    assert.equal(updated.find(item => item.id === game.id).isHiddenByAdmin, true, "refresh preserves existing admin OFF");
    assert.deepEqual(updated.find(item => item.id === added.id), { ...added, currency: "PKR", slug: `slug-${added.id}`, isActive: true, isHiddenByAdmin: false, isHot: false });
  } finally { catalog.restore(); }
});

test("catalogue order stays provider/name/ID based across reversed API refreshes and admin changes", async () => {
  const games = [
    { ...game, id: "z", provider: "Z Studio", title: "Game 1" },
    { ...game, id: "a-10", provider: "A Studio", title: "Game 10" },
    { ...game, id: "a-2-b", provider: "A Studio", title: "Game 2" },
    { ...game, id: "a-2-a", provider: "A Studio", title: "Game 2" },
  ];
  const settings = [];
  const catalog = cachedCatalog(async () => [...games], settings);
  try {
    const expected = ["a-2-a", "a-2-b", "a-10", "z"];
    assert.deepEqual((await catalog.getProviderCatalog()).map(game => game.id), expected);
    games.reverse();
    settings.push({ slug: "slug-z", isActive: true, isHot: true }, { slug: "slug-a-2-a", isActive: false });
    catalog.advance(60_001);
    await catalog.getProviderCatalog();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual((await catalog.getProviderCatalog()).map(game => game.id), expected);
    assert.deepEqual(games.map(game => game.id), ["a-2-a", "a-2-b", "a-10", "z"], "sorting does not mutate the source");
  } finally { catalog.restore(); }
});

function hookHarness(cache = {}) {
  let state, effect, cleanup, dependencies;
  const timers = new Map();
  const window = new EventTarget();
  window.setInterval = (callback, delay) => { assert.equal(delay, 60_000); timers.set(callback, delay); return callback; };
  window.clearInterval = callback => timers.delete(callback);
  const document = new EventTarget();
  document.hidden = false;
  const hook = load("src\\lib\\useProviderCatalog.ts", {
    react: {
      useState: initial => {
        state ??= initial;
        return [state, value => { state = typeof value === "function" ? value(state) : value; }];
      },
      useEffect: (callback, deps) => {
        if (!dependencies || deps.some((value, index) => value !== dependencies[index])) {
          dependencies = deps;
          effect = callback;
        }
      },
    },
    "./gameNavigation": { isGameReturn: () => cache.returning === true },
    "./providerCatalogCache": { warmProviderCatalog: () => cache.warm ?? null, readReturnCatalog: async () => cache.saved ?? null, saveProviderCatalog: async () => {} },
  }, { window, document });
  return {
    render: enabled => {
      const result = hook.useProviderCatalog(enabled);
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
      return result;
    },
    unmount: () => cleanup?.(),
    tick: () => { for (const callback of timers.keys()) callback(); },
    focus: () => window.dispatchEvent(new Event("focus")),
    visibility: hidden => { document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")); },
    timerCount: () => timers.size,
  };
}

test("mounted player panels receive future games on visible refresh without clearing the current catalogue", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = () => new Promise(resolve => requests.push(resolve));
  const hook = hookHarness();
  try {
    hook.render(true);
    requests[0](Response.json({ games: [game] }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hook.timerCount(), 1);
    hook.tick();
    hook.focus();
    assert.equal(requests.length, 2, "focus must not duplicate an in-flight periodic refresh");
    assert.deepEqual(hook.render(true), { games: [game], loading: false, error: "" });
    const added = { ...game, id: "future-game" };
    requests[1](Response.json({ games: [game, added] }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(hook.render(true).games.map(game => game.id), [game.id, added.id]);
    hook.visibility(true);
    hook.tick();
    hook.focus();
    assert.equal(requests.length, 2, "hidden tabs do not fetch");
    hook.visibility(false);
    assert.equal(requests.length, 3, "returning to the tab refreshes");
    requests[2](Response.json({ error: "Refresh failed" }, { status: 503 }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hook.render(true).games.length, 2);
    assert.equal(hook.render(true).error, "Refresh failed");
    hook.focus();
    requests[3](Response.json({ games: [added] }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(hook.render(true), { games: [added], loading: false, error: "" });
    hook.unmount();
    assert.equal(hook.timerCount(), 0);
    hook.tick();
    hook.focus();
    hook.visibility(false);
    assert.equal(requests.length, 4, "unmount removes timers and listeners");
  } finally { hook.unmount(); globalThis.fetch = previous; }
});

test("returning panels display cached games before the network completes and fresh restrictions replace the cache", async () => {
  const previous = globalThis.fetch;
  let release;
  globalThis.fetch = () => new Promise(resolve => { release = resolve; });
  const hook = hookHarness({ returning: true, saved: [game] });
  try {
    hook.render(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hook.render(true).loading, false);
    assert.equal(hook.render(true).games[0].id, game.id);
    release(Response.json({ games: [] }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(hook.render(true).games, []);
  } finally { hook.unmount(); globalThis.fetch = previous; }
});

test("catalog hook keeps the same result across renders and disables duplicate child fetching", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json({ games: [game] });
  };
  const hook = hookHarness(), child = hookHarness();
  try {
    assert.equal(hook.render(true).loading, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(hook.render(true), { games: [game], loading: false, error: "" });
    hook.render(true);
    child.render(false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/gregmorn/catalog");
    assert.equal(requests[0].options.cache, "no-store", "personalized results must not enter browser cache");
    hook.unmount();
    assert.equal(requests[0].options.signal.aborted, true);
  } finally { hook.unmount(); child.unmount(); globalThis.fetch = previous; }
});

test("catalog hook reports provider errors and ignores aborted responses", async () => {
  const previous = globalThis.fetch;
  try {
    for (const [body, status, message] of [
      [{ error: "Unavailable" }, 503, "Unavailable"],
      [{ games: null }, 200, "invalid game catalogue"],
    ]) {
      globalThis.fetch = async () => Response.json(body, { status });
      const hook = hookHarness();
      hook.render(true);
      await new Promise(resolve => setImmediate(resolve));
      const state = hook.render(true);
      assert.equal(state.loading, false);
      assert.match(state.error, new RegExp(message));
      hook.unmount();
    }
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const hook = hookHarness();
    hook.render(true);
    hook.unmount();
    release(Response.json({ games: [game] }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(hook.render(true).games, []);
  } finally { globalThis.fetch = previous; }
});

test("home starts its catalog hook before the lobby/session loading gate", () => {
  let calls = 0;
  const jsx = (type, props) => ({ type, props });
  const home = load("src\\app\\HomeClient.tsx", {
    react: { useState: value => [value, () => {}], useEffect: () => {} },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/lobby/Lobby": { Header: "header", Lobby: "lobby", CONTAINER: "container" },
    "@/lib/useDb": { useSession: () => ({ loading: true }), PageLoadingSkeleton: "skeleton" },
    "@/lib/useProviderCatalog": { useProviderCatalog: () => { calls++; return { games: [], loading: true, error: "" }; } },
  });
  const tree = home.default({ cat: "Hot" });
  assert.equal(calls, 1);
  assert.match(JSON.stringify(tree), /Lobby loading/);
});

test("catalog API starts provider and session reads together and keeps player responses private", async () => {
  let releaseSession;
  const session = new Promise(resolve => { releaseSession = resolve; });
  let catalogStarted = false;
  const route = load("src\\app\\api\\gregmorn\\catalog\\route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/serverAuth": { getServerSessionUser: () => session },
    "@/lib/gregmornCatalog": { getProviderCatalog: async () => {
      catalogStarted = true;
      return [
        { ...game, slug: "allowed", isActive: true },
        { ...game, slug: "blocked", isActive: true },
        { ...game, slug: "off", isActive: false },
      ];
    } },
  });
  const pending = route.GET(new Request("https://site.example/api/gregmorn/catalog"));
  assert.equal(catalogStarted, true, "provider fetch must not wait for session lookup");
  releaseSession({ blockedGames: ["blocked"] });
  const response = await pending;
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).games.map(item => item.slug), ["allowed"]);
});

test("initial provider thumbnails load eagerly without changing the displayed games", () => {
  const jsx = (type, props) => ({ type, props });
  const enabled = [];
  const component = load("src\\components\\lobby\\GregmornGames.tsx", {
    "@/lib/providerCategories": load("src\\lib\\providerCategories.ts"),
    "@/lib/providerOrder": order,
    react: { useId: () => "title", useState: initial => [initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => ({}) },
    "next/image": { default: "image" },
    "@/lib/auth": {},
    "@/components/Icons": { FlameIcon: "flame" },
    "@/lib/gameNavigation": { useGameReturnScroll: () => {} },
    "./GameThumbnail": { GameThumbnail: "thumbnail" },
    "./GameGridSkeleton": { GameGridSkeleton: "skeleton" },
    "./HotSlider": { HotSlider: "slider" },
    "@/lib/useProviderCatalog": { useProviderCatalog: value => {
      enabled.push(value);
      return { games: [], loading: true, error: "" };
    } },
  });
  const games = Array.from({ length: 8 }, (_, index) => ({ ...game, id: `game-${index}` }));
  const tree = component.GregmornGames({ catalog: { games, loading: false, error: "" } });
  const thumbnails = [];
  function visit(node) {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") {
      if (node.type === "thumbnail") thumbnails.push(node.props);
      visit(node.props?.children);
    }
  }
  visit(tree);
  assert.deepEqual(enabled, [false], "a supplied catalog must not trigger a second request");
  assert.equal(thumbnails.length, games.length);
  assert.deepEqual(thumbnails.map(item => item.loading), [...Array(6).fill("eager"), "lazy", "lazy"]);
  assert.ok(thumbnails.every(item => item.src === game.imageUrl));
});
