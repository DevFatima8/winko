import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const tick = () => new Promise(resolve => setImmediate(resolve));
const catalog = load("src\\lib\\gameCatalog.ts");
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", ...Object.keys(globals), code)(
    name => { assert.ok(name in imports, name); return imports[name]; }, exports, ...Object.values(globals),
  );
  return exports;
}

test("artwork uses the card's exact responsive URLs, waits for decoding, limits concurrency and retries failures", async () => {
  const images = [], warnings = [];
  class FakeImage {
    decoded = deferred();
    constructor() { images.push(this); }
    decode() { return this.decoded.promise; }
    succeed() { this.onload(); this.decoded.resolve(); this.finished = true; }
  }
  const imageModule = nativeRequire("next/image");
  const artwork = load("src\\lib\\gameArtwork.ts", { "next/image": imageModule, "./gameCatalog": catalog }, {
    window: { Image: FakeImage }, console: { warn: (...args) => warnings.push(args) },
  });
  let notifications = 0;
  const unsubscribe = artwork.subscribeGameArtwork(() => notifications++);
  const sources = Array.from({ length: 8 }, (_, i) => `/games/${i}.jpg`);
  const warming = artwork.preloadGameArtwork([...sources, sources[0]]);
  assert.equal(images.length, 6);
  const expected = imageModule.getImageProps({ src: sources[0], alt: "", width: 1024, height: 700, sizes: artwork.GAME_THUMBNAIL_SIZES }).props;
  assert.equal(images[0].srcset, expected.srcSet);
  assert.equal(images[0].sizes, expected.sizes);
  assert.equal(images[0].src, expected.src);
  images[0].onload();
  await tick();
  assert.equal(artwork.isGameArtworkReady(sources[0]), false);
  assert.equal(images.length, 6, "decode is part of the concurrency budget");
  images[0].decoded.resolve();
  images[0].finished = true;
  await tick();
  assert.equal(images.length, 7);
  for (let batch = 0; batch < 3; batch++) {
    for (const image of [...images]) if (!image.finished) image.succeed();
    await tick();
  }
  assert.deepEqual(await warming, { failed: 0 });
  assert.equal(images.length, 8);
  assert.equal(notifications, 8);
  await artwork.preloadGameArtwork(sources);
  assert.equal(images.length, 8, "ready artwork is reused");
  unsubscribe();
  const broken = artwork.preloadGameArtwork(["/games/broken.jpg"]);
  images.at(-1).onerror();
  assert.deepEqual(await broken, { failed: 1 });
  assert.equal(artwork.isGameArtworkReady("/games/broken.jpg"), false);
  assert.equal(warnings.length, 1);
  const retry = artwork.preloadGameArtwork(["/games/broken.jpg"]);
  images.at(-1).succeed();
  assert.deepEqual(await retry, { failed: 0 });
  assert.equal(notifications, 8, "unmounted cards are unsubscribed");
  const local = artwork.preloadGameArtwork([catalog.GAME_IMAGES.aviator]);
  assert.equal(images.at(-1).src, "/games/thumbnails/aviator.webp");
  assert.equal(images.at(-1).srcset, undefined, "preloader and rendered thumbnail use the same static URL");
  images.at(-1).succeed();
  assert.deepEqual(await local, { failed: 0 });
});

test("splash waits only for first-screen artwork, with a deadline and safe cleanup", async () => {
  for (const deadline of [false, true]) {
    const artwork = deferred(), catalog = deferred(), timers = new Map(), updates = [], warnings = [];
    let effect, now = 0, id = 0;
    const window = {
      location: { pathname: "/" },
      setTimeout(fn, delay) { const key = ++id; timers.set(key, { fn, at: now + delay }); return key; },
      clearTimeout(key) { timers.delete(key); },
    };
    const advance = async amount => {
      now += amount;
      for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); }
      await tick();
    };
    load("src\\components\\SplashScreen.tsx", {
      react: { useState: initial => [initial, value => updates.push(value)], useEffect: fn => { effect = fn; } },
      "react/jsx-runtime": { jsx: () => ({}), jsxs: () => ({}) },
      "@/lib/gameNavigation": { isGameReturn: () => false },
      "@/lib/gameCatalog": { GAME_SLUGS: Array.from({ length: 70 }, (_, i) => String(i)), GAME_IMAGES: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [String(i), `/games/${i}.jpg`])) },
      "@/lib/gameArtwork": { preloadGameArtwork: sources => { assert.equal(sources.length, 12); return artwork.promise; } },
      "@/lib/providerCatalogCache": { loadProviderCatalog: () => catalog.promise },
    }, { window, document: { readyState: "complete", documentElement: { dataset: {} } }, Date: { now: () => now }, console: { warn: (...args) => warnings.push(args) } }).SplashScreen();
    const cleanup = effect();
    catalog.resolve([]);
    await advance(1000);
    assert.deepEqual(updates, [], "catalogue readiness alone does not reveal incomplete cards");
    if (deadline) await advance(9000);
    else { artwork.resolve({ failed: 0 }); await tick(); }
    await advance(0);
    assert.deepEqual(updates, [true]);
    await advance(500);
    assert.deepEqual(updates, [true, true]);
    assert.equal(warnings.length, deadline ? 1 : 0);
    cleanup();
    artwork.resolve({ failed: 0 });
    await tick();
    assert.deepEqual(updates, [true, true]);
  }
});

test("splash and panels share a catalogue request; account changes abort stale results without clearing a newer request", async () => {
  const requests = [];
  const cache = load("src\\lib\\providerCatalogCache.ts", {
    "./gameAvailability": { PROVIDER_GAMES_VISIBLE: false, SITE_CATALOG_URL: "/api/public/data?view=catalog" },
  }, {
    window: { setTimeout, clearTimeout },
    sessionStorage: { getItem: () => null, removeItem: () => {} },
    fetch: (url, options) => { const result = deferred(); requests.push({ ...result, url, options }); return result.promise; },
  });
  const first = cache.loadProviderCatalog();
  assert.equal(cache.loadProviderCatalog(), first);
  assert.equal(requests.length, 1);
  requests[0].resolve(Response.json({ games: [{ id: "first" }] }));
  await first;
  assert.equal(cache.warmProviderCatalog()[0].id, "first");
  const stale = cache.loadProviderCatalog();
  const rejected = assert.rejects(stale, /abort/i);
  await cache.clearProviderCatalog();
  assert.equal(requests[1].options.signal.aborted, true);
  const fresh = cache.loadProviderCatalog();
  requests[1].resolve(Response.json({ games: [{ id: "stale" }] }));
  await rejected;
  assert.equal(cache.loadProviderCatalog(), fresh);
  requests[2].resolve(Response.json({ games: [{ id: "fresh" }] }));
  await fresh;
  assert.equal(cache.warmProviderCatalog()[0].id, "fresh");
});

test("service worker reuses optimized artwork by full URL without intercepting APIs, RSC or private image sources", async () => {
  const handlers = {}, entries = new Map(), requests = [], writes = [];
  const origin = "https://fixture.invalid";
  const cache = { put: async (req, res) => entries.set(req.url, res), addAll: async () => {} };
  new Function("self", "caches", "fetch", readFileSync("public\\sw.js", "utf8"))(
    { location: { origin }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    { match: async req => entries.get(req.url)?.clone(), open: async () => cache },
    async req => { requests.push(req.url); return new Response("artwork"); },
  );
  async function get(path, headers = {}) {
    let response;
    handlers.fetch({ request: new Request(origin + path, { headers }), respondWith: value => { response = value; }, waitUntil: value => writes.push(value) });
    const result = await response;
    await Promise.all(writes.splice(0));
    return result;
  }
  const thumbnail = "/_next/image?url=%2Fgames%2Fcover.jpg&w=384&q=75";
  await get(thumbnail);
  await get(thumbnail);
  assert.equal(requests.length, 1);
  await get(thumbnail.replace("384", "640"));
  assert.equal(requests.length, 2, "responsive variants do not collide");
  assert.equal(await get("/api/public/data?view=catalog"), undefined);
  assert.equal(await get(thumbnail, { RSC: "1" }), undefined);
  assert.equal(await get("/_next/image?url=%2Fapi%2Fplayer%2Favatar&w=384&q=75"), undefined);
  assert.equal(requests.length, 2);
});
