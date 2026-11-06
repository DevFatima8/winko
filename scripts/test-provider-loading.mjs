import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

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
    assert.equal(warm[0].isHot, true);
    assert.deepEqual(calls, ["PKR"]);
    assert.equal((await catalog.getProviderCatalog("USD"))[0].id, `${game.id}-USD`);
    assert.deepEqual(calls, ["PKR", "USD"]);
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

function hookHarness(cache = {}) {
  let state, effect, cleanup, dependencies;
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
  });
  return {
    render: enabled => {
      const result = hook.useProviderCatalog(enabled);
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
      return result;
    },
    unmount: () => cleanup?.(),
  };
}

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
    react: { useId: () => "title", useState: initial => [initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/auth": {},
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
