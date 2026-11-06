import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const categories = load("src\\lib\\providerCategories.ts");

test("provider taxonomy and narrow corrections classify games without slot mislabelling", () => {
  const cases = [
    ["Aviator", "slots", "Mini Games"], ["Mines", "Slot", "Mini Games"],
    ["Plinko", "slots", "Mini Games"], ["Chicken Dash 10000", "Slots", "Mini Games"],
    ["Ludo Quick", "table", "Mini Games"], ["Aviatrix", "slots", "Mini Games"],
    ["Big Bass Crash", "crash", "Mini Games"], ["Limbo", "instant win", "Mini Games"],
    ["Tower", "tower", "Mini Games"], ["Test Arcade", "arcade", "Mini Games"],
    ["Blackjack", "card", "Cards"], ["Teen Patti 20-20", "table", "Cards"],
    ["Jacks or Better", "video poker", "Cards"], ["Top Card Trumps (Casino War)", "table", "Cards"],
    ["Blackjack Live", "live", "Live"], ["Dream Catcher", "game_shows", "Live"],
    ["Roulette", "roulette", "Live"], ["Sic Bo", "table", "Live"],
    ["Live Studio", "live dealer", "Live"], ["e-Horse Racing", "virtual sport", "Sports"],
    ["Fishing God", "shooting", "Fishing"], ["Jackpot Fishing", "fish", "Fishing"],
    ["Keno Super Chance", "slots", "Lottery"], ["Bingo", "bingo", "Lottery"],
    ["Scratch It", "scratch card", "Lottery"], ["Sweet Bonanza", "Slots", "Slot"],
    ["Not Classified", "other", null], ["No Category", undefined, null],
  ];
  for (const [title, category, expected] of cases) {
    assert.equal(categories.providerCategory({ title, category, provider: "Studio" }), expected, title);
  }
  assert.equal(categories.providerCategory({ title: "Mega Ball", category: "other", provider: "EvolutionGaming" }), "Live");
  assert.equal(categories.providerCategory({ title: "Unrelated Slot", category: "betsoft-a", provider: "Betsoft" }), null);
});

test("All and Hot preserve games regardless of category, and categories are exclusive", () => {
  const games = [
    { title: "Aviator", category: "slots", provider: "SPRIBE", isHot: true },
    { title: "Sweet Bonanza", category: "slots", provider: "PP", isHot: false },
    { title: "Roulette", category: "live", provider: "EvolutionGaming", isHot: true },
    { title: "Unknown", provider: "Other", isHot: true },
  ];
  assert.deepEqual(games.filter(game => categories.matchesProviderCategory(game, "All")), games);
  assert.deepEqual(games.filter(game => categories.matchesProviderCategory(game, "Hot")), [games[0], games[2], games[3]]);
  for (const [category, expected] of [["Mini Games", [games[0]]], ["Slot", [games[1]]], ["Live", [games[2]]], ["Fishing", []]]) {
    assert.deepEqual(games.filter(game => categories.matchesProviderCategory(game, category)), expected);
  }
});

test("shared panel filters rendered cards by category, provider and search together", () => {
  const jsx = (type, props) => ({ type, props });
  let stateOverrides = [];
  let stateIndex = 0;
  const { GregmornGames } = load("src\\components\\lobby\\GregmornGames.tsx", {
    react: {
      useId: () => "games",
      useState: initial => [stateOverrides[stateIndex++] ?? initial, () => {}],
      useEffect: () => {}, useRef: () => ({ current: null }),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/auth": {},
    "@/lib/gameNavigation": { useGameReturnScroll: () => {} },
    "@/lib/providerCategories": categories,
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
    "./GameThumbnail": { GameThumbnail: "thumbnail" },
    "./GameGridSkeleton": { GameGridSkeleton: "skeleton" },
    "./HotSlider": { HotSlider: "slider" },
  });
  const games = [
    { id: "a", title: "Aviator", category: "slots", provider: "SPRIBE", isHot: true },
    { id: "b", title: "Mines", category: "minigame", provider: "SPRIBE", isHot: false },
    { id: "c", title: "Roulette", category: "live", provider: "Evolution", isHot: true },
    { id: "d", title: "Sweet Bonanza", category: "slots", provider: "PP", isHot: false },
  ].map(game => ({ ...game, imageUrl: "https://cdn.example/game.jpg" }));
  function titles(category, search = "", provider = "") {
    stateIndex = 0;
    stateOverrides = [search, provider];
    const tree = GregmornGames({ category, catalog: { games, loading: false, error: "" } });
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object") {
        if (node.type === "thumbnail") result.push(node.props.alt);
        visit(node.props?.children);
      }
    }
    visit(tree);
    return result;
  }
  assert.deepEqual(titles("Mini Games"), ["Aviator", "Mines"]);
  assert.deepEqual(titles("Mini Games", "mine", "SPRIBE"), ["Mines"]);
  assert.deepEqual(titles("Mini Games", "", "Evolution"), []);
  assert.deepEqual(titles("Live"), ["Roulette"]);
  assert.deepEqual(titles("Slot"), ["Sweet Bonanza"]);
  assert.deepEqual(titles("Hot"), ["Aviator", "Roulette"]);
  assert.equal(titles("All").length, games.length);
});
