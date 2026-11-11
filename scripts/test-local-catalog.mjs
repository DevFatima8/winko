import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
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

const availability = load("src\\lib\\gameAvailability.ts");
const images = load("src\\lib\\gameCatalog.ts");
const categories = load("src\\lib\\providerCategories.ts");
const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const jsx = (type, props) => ({ type, props });

function fixture() {
  const rows = new Map(), writes = [];
  const Game = {
    findOne: ({ slug }) => Promise.resolve(rows.get(slug)),
    create: async game => { rows.set(game.slug, { _id: `db-${game.slug}`, ...game }); },
    find: filter => ({ lean: async () => [...rows.values()].filter(game => filter.slug.$in.includes(game.slug)) }),
    updateMany: async (filter, update) => {
      writes.push({ filter, update });
      for (const game of rows.values()) {
        if (filter.slug.$regex.test(game.slug) && !(filter.isActive && !game.isActive)) Object.assign(game, update.$set);
      }
    },
  };
  const seed = load("src\\lib\\seed.ts", {
    "./mongo": {}, "./mysql": { isMysqlEnabled: () => false },
    "@/models": { Game }, "./platform": {},
  });
  let upstream = 0;
  const provider = {
    getProviderCatalog: async () => { upstream++; return [{ slug: "gregmorn-saved" }]; },
    saveProviderGame: async () => { throw new Error("Local controls must not change provider records"); },
  };
  const catalog = load("src\\lib\\siteGameCatalog.ts", {
    "@/models": { Game }, "./seed": seed, "./gameCatalog": images,
    "./gameAvailability": availability, "./gregmornCatalog": provider,
  });
  return { rows, Game, seed, catalog, writes, upstream: () => upstream };
}

test("all 70 saved local games have their own image and implemented route; provider data stays untouched", async () => {
  const f = fixture();
  f.rows.set("gregmorn-saved", { _id: "provider-db", slug: "gregmorn-saved", name: "API game", isActive: true, isHot: true });
  const providerBefore = structuredClone(f.rows.get("gregmorn-saved"));
  const games = await f.catalog.getSiteGameCatalog();
  assert.equal(availability.LOCAL_GAMES_CONNECTED, true);
  assert.equal(availability.PROVIDER_GAMES_VISIBLE, false);
  assert.equal(availability.SITE_CATALOG_URL, "/api/public/data?view=catalog");
  assert.equal(games.length, 70);
  assert.deepEqual(games.map(game => game.slug), [...images.GAME_SLUGS]);
  const engines = readFileSync("src\\components\\GameView.tsx", "utf8");
  for (const game of games) {
    assert.equal(game.imageUrl, images.GAME_IMAGES[game.slug]);
    assert.ok(existsSync(`public${game.imageUrl.replaceAll("/", "\\")}`), game.slug);
    assert.ok(engines.includes(`slug === "${game.slug}"`), game.slug);
    assert.ok(categories.providerCategory(game), `Missing category: ${game.slug}`);
    assert.equal(game.currency, "PKR");
  }
  assert.equal(categories.providerCategory(games.find(game => game.slug === "fishing-arcade")), "Fishing");
  assert.equal(categories.providerCategory(games.find(game => game.slug === "lucky-777")), "Slot");
  assert.equal(f.upstream(), 0);
  assert.deepEqual(f.rows.get("gregmorn-saved"), providerBefore);
});

test("admin OFF/Hot and user restrictions operate on local games without resetting saved settings", async () => {
  const f = fixture();
  await f.catalog.getSiteGameCatalog();
  f.rows.get("mines").isActive = false;
  f.rows.get("mines").isHot = true;
  f.rows.get("aviator").isHot = true;
  let games = await f.catalog.getSiteGameCatalog();
  assert.equal(games.find(game => game.slug === "mines").isHot, false);
  assert.equal(games.find(game => game.slug === "mines").isActive, false);
  assert.equal(games.find(game => game.slug === "aviator").isHot, true);
  const actions = load("src\\lib\\actions.ts", {
    "next/cache": { revalidatePath: () => {} }, "@/models": { Game: f.Game },
    "./auth": {}, "./serverAuth": { getServerSessionUser: async () => ({ role: "admin", level: 3 }) },
    "./platform": {}, "./notifications": {}, "./cloudinary": {}, "./siteGameCatalog": f.catalog,
  });
  await actions.toggleGameAction("mines", true);
  await actions.toggleGameHotAction("mines", true);
  assert.equal(f.rows.get("mines").isActive, true);
  assert.equal(f.rows.get("mines").isHot, true);
  await actions.toggleGameAction("mines", false);
  assert.equal(f.rows.get("mines").isHot, false);
  await assert.rejects(actions.toggleGameAction("gregmorn-saved", false), /not available/);
  const route = load("src\\app\\api\\public\\data\\route.ts", {
    "next/server": next, "@/models": {}, "@/lib/serverAuth": { getServerSessionUser: async () => ({ blockedGames: ["aviator"] }) },
    "@/lib/platform": {}, "@/lib/mongo": { dbConnect: async () => {} }, "@/lib/gameCatalog": images,
    "@/lib/gameAvailability": availability, "@/lib/siteGameCatalog": f.catalog,
  });
  const response = await route.GET(new Request("https://site.example/api/public/data?view=catalog"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  games = (await response.json()).games;
  assert.equal(games.length, 68);
  assert.ok(games.every(game => !["mines", "aviator"].includes(game.slug)));
  assert.equal(f.upstream(), 0);
});

test("local cards keep the existing presentation and navigate to local engines without a provider launch", async () => {
  const navigations = [], returns = [];
  const f = fixture();
  const games = await f.catalog.getSiteGameCatalog();
  let user = { dbRole: "client" };
  const component = load("src\\components\\lobby\\GregmornGames.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useId: () => "games", useState: initial => [initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) },
    "next/navigation": { useRouter: () => ({ push: href => navigations.push(href) }) },
    "@/lib/auth": { getCurrentUser: async () => user },
    "./GameThumbnail": { GameThumbnail: "thumbnail" }, "./GameGridSkeleton": {}, "./HotSlider": {},
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
    "@/lib/gameNavigation": { useGameReturnScroll: () => {}, rememberGameReturn: value => returns.push(value) },
    "@/lib/providerCategories": categories, "@/lib/providerOrder": load("src\\lib\\providerOrder.ts"),
    "@/lib/gameAvailability": availability,
  });
  const tree = component.GregmornGames({ catalog: { games, loading: false, error: "" } });
  const cards = [];
  function visit(node) {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") {
      if (node.type === "button" && node.props.onClick && node.props.className?.includes("group relative")) cards.push(node);
      visit(node.props?.children);
    }
  }
  visit(tree);
  assert.equal(cards.length, 60, "existing Load More page size stays unchanged");
  cards[0].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(navigations[0], /^\/player\/games\//);
  user = null;
  cards[1].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(navigations[1], /^\/games\//);
  assert.equal(returns.length, 2);
});

test("public availability respects admin OFF and does not reactivate games", async () => {
  let active = false;
  const query = { lean: async () => ({ isActive: active }) };
  const route = load("src\\app\\api\\public\\data\\route.ts", {
    "next/server": next, "@/models": { Game: { findOne: () => query } },
    "@/lib/serverAuth": {}, "@/lib/platform": {}, "@/lib/mongo": { dbConnect: async () => {} },
    "@/lib/gameCatalog": images, "@/lib/gameAvailability": availability, "@/lib/siteGameCatalog": {},
    "@/lib/seed": { ensureGames: async () => {} },
  });
  const request = () => new Request("https://site.example/api/public/data?view=game&slug=mines");
  assert.deepEqual(await (await route.GET(request())).json(), { active: false });
  active = true;
  assert.deepEqual(await (await route.GET(request())).json(), { active: true });
});

test("admin game controls, restrictions and results all list local games with correct saved totals and artwork", async () => {
  const f = fixture();
  await f.catalog.getSiteGameCatalog();
  f.rows.set("gregmorn-saved", { _id: "provider-db", slug: "gregmorn-saved", name: "API game", isActive: true, isHot: true });
  const stats = [
    { _id: "db-mines", c: 2, bet: 20, win: 5, total: 2, wins: 1, losses: 1, paid: 5 },
    { _id: "mines", c: 1, bet: 10, win: 0, total: 1, wins: 0, losses: 1, paid: 0 },
    { _id: "provider-db", c: 4, bet: 40, win: 0, total: 4, wins: 0, losses: 4, paid: 0 },
  ];
  const route = load("src\\app\\api\\admin\\data\\route.ts", {
    "next/server": next,
    "@/models": {
      Game: { find: filter => ({ lean: async () => [...f.rows.values()].filter(game => !filter || filter.slug.$in.includes(game.slug)) }) },
      GameResult: { aggregate: async () => stats },
      User: {
        aggregate: async () => [{ _id: "mines", c: 1 }],
        findById: () => ({ lean: async () => ({ _id: "player", role: "client", blockedGames: ["mines", "gregmorn-saved"] }) }),
      },
    },
    "@/lib/serverAuth": { getServerSessionUser: async () => ({ dbRole: "admin", level: 2 }) },
    "@/lib/auth": { isStaff: role => role === "admin" }, "@/lib/platform": {},
    "@/lib/siteGameCatalog": f.catalog, "@/lib/gameCatalog": images,
    "@/lib/gameAvailability": availability,
    "@/lib/gameResultGames": load("src\\lib\\gameResultGames.ts"), "@/lib/dashboardLogins": {},
  });
  const response = await route.GET(new Request("https://site.example/api/admin/data?view=games"));
  assert.equal(response.status, 200);
  const games = (await response.json()).games;
  assert.equal(games.length, 70);
  const mines = games.find(game => game.slug === "mines");
  assert.deepEqual(mines.stats, { c: 3, bet: 30, win: 5 });
  assert.equal(mines.imageUrl, images.GAME_IMAGES.mines);
  const restrictions = await (await route.GET(new Request("https://site.example/api/admin/data?view=user-game-restrictions&id=player"))).json();
  assert.equal(restrictions.games.length, 70);
  assert.deepEqual(restrictions.blockedGames, ["mines"]);
  const results = await (await route.GET(new Request("https://site.example/api/admin/data?view=results"))).json();
  assert.equal(results.games.length, 70);
  assert.ok(results.games.every(game => !game.refs && game.name !== "API game"));
  const mineResults = results.games.find(game => game.name === "Mines");
  assert.equal(mineResults.total, 3);
  assert.equal(mineResults.profit, 25);
  assert.equal(mineResults.icon, images.GAME_IMAGES.mines);
  assert.equal(f.upstream(), 0);
});

test("local game URL entrypoints render their existing engines when reconnected", async () => {
  for (const path of ["src\\app\\games\\[slug]\\page.tsx", "src\\app\\player\\games\\[slug]\\page.tsx"]) {
    const route = load(path, {
      "./Client": { default: "engine" }, "react/jsx-runtime": { jsx },
      "next/navigation": { redirect: () => assert.fail("Local game must not redirect to provider catalogue") },
      "@/lib/gameAvailability": availability,
    });
    const tree = await route.default({ params: Promise.resolve({ slug: "mines" }), searchParams: Promise.resolve({}) });
    assert.equal(tree.type, "engine");
    assert.equal(tree.props.params.slug, "mines");
  }
});
