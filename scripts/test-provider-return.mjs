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

const jsx = (type, props) => ({ type, props });
const tick = () => new Promise(resolve => setImmediate(resolve));

function hooks() {
  const slots = [], effects = [], refs = [];
  let cursor = 0, effectCursor = 0, refCursor = 0;
  return {
    react: {
      useId: () => "title",
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
      },
      useRef: initial => {
        const index = refCursor++;
        refs[index] ??= { current: initial };
        return refs[index];
      },
      useEffect: (callback, deps) => {
        const index = effectCursor++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          previous?.cleanup?.();
          effects[index] = { deps, callback };
        }
      },
    },
    render: callback => {
      cursor = effectCursor = refCursor = 0;
      const result = callback();
      for (const effect of effects) {
        if (effect.callback) {
          effect.cleanup = effect.callback();
          effect.callback = undefined;
        }
      }
      return result;
    },
    unmount: () => effects.forEach(effect => effect.cleanup?.()),
  };
}

function browser(pathname = "/games-all") {
  const names = ["window", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "fetch"];
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const entries = new Map(), frames = new Map(), listeners = new Map(), scrolls = [];
  let id = 0;
  globalThis.window = {
    location: { pathname, search: "?cat=Hot", hash: "#games", assign: url => { globalThis.window.assigned = url; } },
    scrollY: 1450,
    scrollTo: options => scrolls.push(options.top),
    addEventListener: (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
  };
  globalThis.sessionStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  return {
    entries, scrolls,
    frame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    },
    event: (name, event) => listeners.get(name)?.forEach(callback => callback(event)),
    restore: () => names.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(globalThis, name, previous[index]);
      else delete globalThis[name];
    }),
  };
}

function navigation(react) {
  return load("src\\lib\\gameNavigation.ts", {
    react, "next/navigation": { usePathname: () => window.location.pathname },
  });
}

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => find(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate),
    ...find(tree.props?.hot, predicate), ...find(tree.props?.rest, predicate)];
}

const state = { category: "Hot", search: "Aviator", provider: "SPRIBE", limit: 120, sliderScrollLeft: 640 };

test("return storage preserves the view only for the originating page and scroll waits for rendered games", () => {
  const env = browser(), runtime = hooks(), nav = navigation(runtime.react);
  try {
    nav.rememberGameReturn(state);
    assert.deepEqual(nav.readProviderGameReturn(), state);
    runtime.render(() => nav.useGameReturnScroll(false));
    env.frame(); env.frame();
    assert.deepEqual(env.scrolls, []);
    assert.equal(nav.hasGameReturn(), true);
    runtime.render(() => nav.useGameReturnScroll(true));
    env.frame(); env.frame();
    assert.deepEqual(env.scrolls, [1450]);
    assert.equal(nav.hasGameReturn(), false);
    nav.rememberGameReturn(state);
    window.location.pathname = "/";
    assert.equal(nav.readProviderGameReturn(), null);
  } finally { runtime.unmount(); env.restore(); }
});

test("provider game departure and full page remount restore search, provider, loaded count and horizontal position", async () => {
  const env = browser("/");
  const departing = hooks(), returning = hooks();
  const nav = navigation({ useEffect: () => {} });
  const games = Array.from({ length: 125 }, (_, index) => ({
    id: `game-${index}`, title: `Aviator ${index}`, provider: "SPRIBE", isHot: true,
    imageUrl: "https://cdn.example/game.jpg",
  }));
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ url: "https://provider.example/play" });
  };
  function panel(runtime) {
    return load("src\\components\\lobby\\GregmornGames.tsx", {
      react: runtime.react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/navigation": { useRouter: () => ({ push: () => {} }) },
      "@/lib/auth": { getCurrentUser: async () => ({ dbRole: "client" }) },
      "@/lib/gameNavigation": { ...nav, useGameReturnScroll: () => {} },
      "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
      "./GameThumbnail": { GameThumbnail: "thumbnail" },
      "./GameGridSkeleton": { GameGridSkeleton: "skeleton" },
      "./HotSlider": { HotSlider: "slider" },
    }).GregmornGames;
  }
  const props = { lobby: true, catalog: { games, loading: false, error: "" } };
  try {
    const firstPanel = panel(departing);
    let tree = departing.render(() => firstPanel(props));
    await tick();
    find(tree, node => node.type === "input")[0].props.onChange({ target: { value: state.search } });
    find(tree, node => node.type === "select")[0].props.onChange({ target: { value: state.provider } });
    tree = departing.render(() => firstPanel(props));
    find(tree, node => node.type === "slider")[0].props.onEnd();
    tree = departing.render(() => firstPanel(props));
    tree.props.ref.current = { querySelector: () => ({ scrollLeft: 640 }) };
    find(tree, node => node.type === "button")[0].props.onClick();
    await tick();
    assert.equal(requestBody.returnTo, "/?cat=Hot#games");
    assert.equal(window.assigned, "https://provider.example/play");
    assert.deepEqual(nav.readProviderGameReturn(), { ...state, category: "All" });
    departing.unmount();
    const secondPanel = panel(returning);
    returning.render(() => secondPanel(props));
    await tick();
    tree = returning.render(() => secondPanel(props));
    assert.equal(find(tree, node => node.type === "input")[0].props.value, state.search);
    assert.equal(find(tree, node => node.type === "select")[0].props.value, state.provider);
    const slider = find(tree, node => node.type === "slider")[0];
    assert.equal(slider.props.hot.length, 120);
    assert.equal(slider.props.initialScrollLeft, 640);
    find(tree, node => node.type === "button")[0].props.onClick();
    await tick();
    env.event("pageshow", { persisted: true });
    tree = returning.render(() => secondPanel(props));
    assert.equal(find(tree, node => node.type === "button")[0].props.disabled, false, "bfcache return clears Opening state");
  } finally { departing.unmount(); returning.unmount(); env.restore(); }
});

test("All Games restores a manually selected category, not just the category in its URL", async () => {
  const env = browser(), runtime = hooks(), nav = navigation({ useEffect: () => {} });
  const component = load("src\\app\\games-all\\AllGames.tsx", {
    react: runtime.react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "link" },
    "next/navigation": { useSearchParams: () => new URLSearchParams("cat=All") },
    "@/components/lobby/Lobby": { CAT_ICONS: {}, PROVIDER_CATS: [{ key: "All" }, { key: "Hot" }], Header: "header", BottomNav: "nav" },
    "@/lib/useDb": { useSession: () => ({ user: null }) },
    "@/lib/i18n/client": { useI18n: () => ({ t: value => value }) },
    "@/components/Icons": { ArrowLeftIcon: "icon", TrophyIcon: "icon", GamepadIcon: "icon" },
    "@/lib/gameNavigation": nav,
    "@/components/lobby/GregmornGames": { GregmornGames: "games" },
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({}) },
  });
  try {
    nav.rememberGameReturn(state);
    runtime.render(() => component.default());
    await tick();
    const tree = runtime.render(() => component.default());
    assert.equal(find(tree, node => node.type === "games")[0].props.category, "Hot");
  } finally { runtime.unmount(); env.restore(); }
});

test("provider slider restores its saved horizontal offset after mounting", () => {
  const runtime = hooks();
  const slider = load("src\\components\\lobby\\HotSlider.tsx", {
    react: runtime.react, "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  let tree;
  runtime.render(() => {
    tree = slider.HotSlider({ hot: [], rest: [], onPhase: () => {}, initialScrollLeft: 640 });
    find(tree, node => node.props?.["data-provider-slider"] !== undefined)[0].props.ref.current = { scrollLeft: 0 };
  });
  assert.equal(find(tree, node => node.props?.["data-provider-slider"] !== undefined)[0].props.ref.current.scrollLeft, 640);
  runtime.unmount();
});

test("browser back refreshes lobby data without unmounting the searched panel", async () => {
  const env = browser("/"), runtime = hooks();
  globalThis.fetch = async () => Response.json({ links: {}, leaderboard: [] });
  const component = load("src\\app\\HomeClient.tsx", {
    react: runtime.react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/lobby/Lobby": { Header: "header", Lobby: "lobby", CONTAINER: "container" },
    "@/lib/useDb": { useSession: () => ({ user: { role: "client" }, loading: false }), PageLoadingSkeleton: "skeleton" },
    "@/lib/useProviderCatalog": { useProviderCatalog: () => ({ games: [], loading: false, error: "" }) },
  });
  try {
    runtime.render(() => component.default({ cat: "Hot" }));
    await tick();
    assert.equal(runtime.render(() => component.default({ cat: "Hot" })).type, "lobby");
    for (const [event, detail] of [["pageshow", { persisted: true }], ["popstate", {}]]) {
      env.event(event, detail);
      assert.equal(runtime.render(() => component.default({ cat: "Hot" })).type, "lobby", "background refresh must retain the panel component");
      await tick();
    }
  } finally { runtime.unmount(); env.restore(); }
});
