import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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
  assert.equal(artwork.providerArtwork("Top Card Trumps (Casino War)", "remote"), images.GAME_IMAGES["casino-war"]);
  assert.equal(artwork.providerArtwork("e-Horse Racing", "remote"), images.GAME_IMAGES["derby-race"]);
  assert.equal(artwork.providerArtwork("Aviator", "/games/already-assigned.jpg"), "/games/already-assigned.jpg");
  for (const title of ["Chicken Dash 10001", "Sweet Bonanza 999", "Wild West Gold Megaways 2", "Aviatrix Fruits Bonus"]) {
    assert.equal(artwork.providerArtwork(title, "remote"), "remote", title);
  }
});

test("all added artwork is indexed, exact variants use their own image and URL fragments are escaped", () => {
  const mapped = new Set(Object.values(images.GAME_IMAGES));
  for (const filename of readdirSync("public\\games")) {
    if (/\.(?:jpg|png)$/i.test(filename)) assert.ok(mapped.has(`/games/${filename}`), filename);
  }
  for (const [title, filename] of [
    ["Gates of Olympus 1000", "Gates-of-Olympus-1000.png"],
    ["Sweet Bonanza 1000", "Sweet-Bonanza-1000.png"],
    ["Lucky 7777", "Luck7777.png"],
    ["Speed Super Sic Bo", "Speed-Super-Sic-Bo.png"],
    ["Teen Patti 20-20", "Teen-Patti-20-20.png"],
    ["Aviatrix Fortunes", "aviatrix-fortune.png"],
    ["40 Super Fruits", "40-40 Super FruitsSuper-Fruits.png"],
    ["Lightning Dice", "lightening-dice.png"],
    ["Türkçe Crazy Time", "Türkçe-Crazy-Time.png"],
    ["Aviatrix Fruits", "Aviatrix-Fruits.png"],
    ["Balloon", "Balloon.png"],
    ["Goal", "goal.png"],
    ["Hi-Lo", "Hi-Lo.png"],
    ["Hilo", "HiLo.png"],
    ["Chicken Dash 10000", "Chicken-Dash-10000.png"],
    ["Wild West Gold Megaways", "Wild-West-Gold-Megaways.png"],
    ["JetX", "JetX.png"],
    ["JetX3", "JetX3.png"],
    ["Fishing God", "Fishing-God.png"],
    ["Football Golden Cup", "Football-Golden-Cup.png"],
    ["Jackpot Fishing", "Jackpot-Fishing.png"],
    ["Jackpot Football", "Jackpot-Football.png"],
    ["Keno Bonus Number", "Keno-Bonus-Number.png"],
    ["Keno Super Chance", "Keno-Super-Chance.png"],
    ["Mines football", "Mines-football.png"],
    ["Money Coming", "Money-Coming.png"],
    ["Money Coming 2", "Money-Coming-2.png"],
    ["Money Coming Expanded Bets", "Money-Coming-Expanded-Bets.png"],
    ["Plinko Empire", "Plinko-Empire.png"],
    ["Plinko Football", "Plinko-Football.png"],
    ["Plinko of Mine", "Plinko-of-Mine.png"],
    ["Cazino Zeppelin", "Cazino-Zeppelin.png"],
    ["Cazino Zeppelin Reloaded", "Cazino-Zeppelin-Reloaded.png"],
  ]) assert.equal(artwork.providerArtwork(title, "remote"), `/games/${filename}`, title);
  assert.equal(artwork.providerArtwork("Wild Ape #3258", "remote"), "/games/Wild-Ape%233258.png");
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
