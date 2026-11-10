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

test("Sports includes confirmed sports themes without removing their original gameplay categories", () => {
  for (const [title, category, primary] of [
    ["Boxing King", "Slot", "Slot"], ["Cricket King 18", "Slot", "Slot"],
    ["Cricket Sah 75", "Slot", "Slot"], ["Goal", "Instant Win", "Mini Games"],
    ["Football Studio", "live", "Live"], ["e-Horse Racing", "virtual sport", "Sports"],
  ]) {
    const game = { title, category, provider: "Studio", isHot: false };
    assert.equal(categories.matchesProviderCategory(game, "Sports"), true, title);
    assert.equal(categories.providerCategory(game), primary);
    assert.equal(categories.matchesProviderCategory(game, primary), true);
  }
  for (const title of ["3 Coin Wild Horse", "Big Bass Crash", "Sweet Bonanza", "Unknown Football Slot"]) {
    assert.equal(categories.matchesProviderCategory({ title, category: "slots", provider: "Studio", isHot: false }, "Sports"), false);
  }
});
test("shared panel keeps category selection and Hot-first provider order without search/provider controls", () => {
  const jsx = (type, props) => ({ type, props });
  const { GregmornGames } = load("src\\components\\lobby\\GregmornGames.tsx", {
    react: {
      useId: () => "games",
      useState: initial => [initial, () => {}],
      useEffect: () => {}, useRef: () => ({ current: null }),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => ({}) },
    "next/image": { default: "image" },
    "@/lib/auth": {},
    "@/components/Icons": { FlameIcon: "flame" },
    "@/lib/gameNavigation": { useGameReturnScroll: () => {} },
    "@/lib/providerCategories": categories,
    "@/lib/providerOrder": load("src\\lib\\providerOrder.ts"),
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
    { id: "e", title: "Cricket King 18", category: "slots", provider: "Jili", isHot: false },
    { id: "f", title: "Unavailable Slot", category: "slots", provider: "PP", isHot: false, isEnabled: false },
  ].map(game => ({
    ...game,
    imageUrl: game.id === "e" ? "/games/Cricket-King-18.png" : game.id === "a" ? "/games/01_Aviator_1024x700.jpg" : "https://cdn.example/game.jpg",
  }));
  function titles(category) {
    const tree = GregmornGames({ category, catalog: { games, loading: false, error: "" } });
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object") {
        assert.ok(node.type !== "input" && node.type !== "select", "search/provider controls are removed");
        if (node.type === "svg" && node.props["aria-label"] === "Hot") {
          assert.match(node.props.className, /\bleft-1 top-1\b/);
          assert.ok(node.props.className.includes("w-[26%]"), "fire and text scale together to the reference card proportion");
          assert.equal(node.props.viewBox, "0 0 80 40");
          const [flame, accent, label] = node.props.children;
          assert.equal(flame.props.fill, "#ef241c");
          assert.equal(accent.props.fill, "#ff6a16");
          assert.equal(label.props.children, "HOT");
          assert.equal(label.props.fill, "#ffe83b");
          assert.equal(label.props.fontStyle, "italic");
          assert.equal(label.props.fontSize, "25");
        }
        if (node.type === "thumbnail") {
          result.push(node.props.alt);
          assert.equal(node.props.className, node.props.src.endsWith("_1024x700.jpg") ? "h-full w-full object-cover object-center" : "h-full w-full object-contain");
        }
        if (node.type === "button" && node.props.title === "This game is currently unavailable from the provider.") {
          assert.equal(node.props.disabled, true);
          assert.match(JSON.stringify(node.props.children), /Unavailable/);
        }
        visit(node.props?.children);
      }
    }
    visit(tree);
    return result;
  }
  assert.deepEqual(titles("Mini Games"), ["Aviator", "Mines"]);
  assert.deepEqual(titles("Live"), ["Roulette"]);
  assert.deepEqual(titles("Slot"), ["Cricket King 18", "Sweet Bonanza", "Unavailable Slot"]);
  assert.deepEqual(titles("Sports"), ["Cricket King 18"]);
  assert.deepEqual(titles("Hot"), ["Roulette", "Aviator"]);
  assert.equal(titles("All").length, games.length);
  const expected = ["Roulette", "Aviator", "Cricket King 18", "Sweet Bonanza", "Unavailable Slot", "Mines"];
  assert.deepEqual(titles("All"), expected);
  games.reverse();
  assert.deepEqual(titles("All"), expected, "upstream reordering cannot shuffle displayed games");
  const manyGames = Array.from({ length: 110 }, (_, index) => ({ ...games[0], id: `game-${index}` }));
  const tree = GregmornGames({ category: "All", catalog: { games: manyGames, loading: false, error: "" } });
  const text = JSON.stringify(tree);
  assert.doesNotMatch(text, /Showing \d+ of \d+ games|Load more games \(/);
  assert.match(text, /Load more games/);
});
