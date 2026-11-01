import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
  return loaded.exports;
}
const images = load("src\\lib\\gameCatalog.ts");
const artwork = load("src\\lib\\providerArtwork.ts", { "./gameCatalog": images });
test("every mapped image exists; exact titles and aliases match without replacing unrelated provider artwork", () => {
  for (const path of Object.values(images.GAME_IMAGES)) assert.ok(existsSync(`public${path.replaceAll("/", "\\")}`), path);
  for (const [title, slug] of [["Aviator", "aviator"], ["AVIATOR X", "aviator-x"], ["Fortune Gems 500", "fortune-gems"], ["Coin Toss (Head/Tail)", "head-tail"], ["Chicken Road 2.0", "chicken-road-2"]]) {
    assert.equal(artwork.providerArtwork(title, "remote"), images.GAME_IMAGES[slug]);
  }
  assert.equal(artwork.providerArtwork("Aviator Bonus 999", "remote"), "remote");
  assert.equal(artwork.providerArtwork("Unknown API Game", "remote"), "remote");
});

test("tab-local return cache handles full catalogues above 2MB, survives a remount, and clears on account changes", async () => {
  const names = ["window", "sessionStorage", "caches", "crypto"];
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const storage = new Map(), entries = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { caches: true } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "fixture-tab" } });
  Object.defineProperty(globalThis, "caches", { configurable: true, value: {
    open: async name => ({
      put: async (key, response) => { entries.set(`${name}:${key}`, await response.json()); },
      match: async key => entries.has(`${name}:${key}`) ? Response.json(entries.get(`${name}:${key}`)) : null,
    }),
    delete: async name => { for (const key of entries.keys()) if (key.startsWith(`${name}:`)) entries.delete(key); },
  } });
  const game = { id: "id", title: "Game", slug: "gregmorn-id", provider: "Provider", isActive: true, isHot: false, imageUrl: `https://img.example/${"a".repeat(250)}` };
  const games = Array.from({ length: 12000 }, (_, i) => ({ ...game, id: `id-${i}` }));
  assert.ok(Buffer.byteLength(JSON.stringify(games)) > 2 * 1024 * 1024);
  try {
    const first = load("src\\lib\\providerCatalogCache.ts");
    await first.saveProviderCatalog(games);
    assert.equal(first.warmProviderCatalog().length, 12000);
    const remount = load("src\\lib\\providerCatalogCache.ts");
    assert.equal((await remount.readReturnCatalog()).length, 12000);
    await remount.clearProviderCatalog();
    assert.equal(await remount.readReturnCatalog(), null);
    assert.equal(entries.size, 0);
  } finally {
    names.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]); else delete globalThis[name]; });
  }
});

test("game-return marker hides splash before hydration, while initial site opens keep the loader", () => {
  const source = readFileSync("src\\app\\layout.tsx", "utf8");
  const code = /__html: '([^']*wx_game_return[^']*)'/.exec(source)?.[1];
  assert.ok(code);
  for (const [saved, expected] of [[{ href: "/games-all", scrollY: 100 }, "true"], [null, undefined], [{ href: "/", scrollY: 1 }, undefined]]) {
    const document = { documentElement: { dataset: {} } };
    new Function("sessionStorage", "location", "document", code)(
      { getItem: () => JSON.stringify(saved) }, { pathname: "/games-all", search: "", hash: "" }, document,
    );
    assert.equal(document.documentElement.dataset.wxGameReturn, expected);
  }
  assert.match(source, /html\[data-wx-game-return="true"\] \.wx-splash\{display:none!important\}/);
});
